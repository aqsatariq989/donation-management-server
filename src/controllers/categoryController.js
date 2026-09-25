const mongoose = require("mongoose");

const Category = require("../models/category");
const Allocation = require("../models/allocation");
const Distribution = require("../models/distribution");

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

const toNumber = (value) => {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === "number") {
    return value;
  }

  return Number(value.toString());
};

const isValidPercentage = (value) => {
  const percentage = Number(value);

  return (
    Number.isFinite(percentage) &&
    percentage >= 0 &&
    percentage <= 100
  );
};

const isActiveCategory = (category) => {
  return category.isActive !== false;
};

/*
|--------------------------------------------------------------------------
| Get Active Percentage Total
|--------------------------------------------------------------------------
|
| excludeId:
| Used when updating an existing category so that its
| current percentage is not counted twice.
|
*/

const getActivePercentageTotal = async (
  excludeId = null
) => {
  const filter = {
    isActive: true,
  };

  if (excludeId) {
    filter._id = {
      $ne: excludeId,
    };
  }

  const categories = await Category.find(
    filter
  ).lean();

  return categories.reduce(
    (total, category) => {
      return (
        total +
        toNumber(
          category.allocationPercentage
        )
      );
    },
    0
  );
};

/*
|--------------------------------------------------------------------------
| Validate Active Percentage Total
|--------------------------------------------------------------------------
*/

const validateActivePercentageTotal =
  async () => {
    const total =
      await getActivePercentageTotal();

    return Number(total.toFixed(6));
  };

/*
|--------------------------------------------------------------------------
| GET ALL CATEGORIES
| GET /api/categories
|--------------------------------------------------------------------------
*/

const getCategories = async (
  req,
  res
) => {
  try {
    const categories =
      await Category.find()
        .sort({
          sortOrder: 1,
          createdAt: 1,
        })
        .lean();

    const data = categories.map(
      (category) => ({
        ...category,

        allocationPercentage:
          toNumber(
            category.allocationPercentage
          ),

        openingBalance:
          toNumber(
            category.openingBalance
          ),

        isActive:
          category.isActive !== false,
      })
    );

    return res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    console.error(
      "Get categories error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch categories",
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET SINGLE CATEGORY
| GET /api/categories/:id
|--------------------------------------------------------------------------
*/

const getCategoryById = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(id)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid category ID",
      });
    }

    const category =
      await Category.findById(id).lean();

    if (!category) {
      return res.status(404).json({
        success: false,
        message:
          "Category not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...category,

        allocationPercentage:
          toNumber(
            category.allocationPercentage
          ),

        openingBalance:
          toNumber(
            category.openingBalance
          ),

        isActive:
          category.isActive !== false,
      },
    });
  } catch (error) {
    console.error(
      "Get category by ID error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch category",
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET CATEGORY BALANCES
| GET /api/categories/balances
|--------------------------------------------------------------------------
*/

const getCategoryBalances = async (
  req,
  res
) => {
  try {
    const categories =
      await Category.find()
        .sort({
          sortOrder: 1,
          createdAt: 1,
        })
        .lean();

    const balances =
      await Promise.all(
        categories.map(
          async (category) => {
            const allocations =
              await Allocation.find({
                categoryId:
                  category._id,
              }).lean();

            const distributions =
              await Distribution.find({
                categoryId:
                  category._id,
              }).lean();

            const totalAllocated =
              allocations.reduce(
                (
                  total,
                  allocation
                ) => {
                  return (
                    total +
                    toNumber(
                      allocation.allocatedAmount
                    )
                  );
                },
                0
              );

            const totalDistributed =
              distributions.reduce(
                (
                  total,
                  distribution
                ) => {
                  return (
                    total +
                    toNumber(
                      distribution.amount
                    )
                  );
                },
                0
              );

            const openingBalance =
              toNumber(
                category.openingBalance
              );

            const remainingBalance =
              openingBalance +
              totalAllocated -
              totalDistributed;

            return {
              categoryId:
                category._id,

              categoryName:
                category.name,

              allocationPercentage:
                Number(
                  toNumber(
                    category.allocationPercentage
                  ).toFixed(6)
                ),

              isActive:
                category.isActive !==
                false,

              openingBalance:
                Number(
                  openingBalance.toFixed(
                    2
                  )
                ),

              totalAllocated:
                Number(
                  totalAllocated.toFixed(
                    2
                  )
                ),

              totalDistributed:
                Number(
                  totalDistributed.toFixed(
                    2
                  )
                ),

              remainingBalance:
                Number(
                  remainingBalance.toFixed(
                    2
                  )
                ),
            };
          }
        )
      );

    return res.status(200).json({
      success: true,
      count: balances.length,
      data: balances,
    });
  } catch (error) {
    console.error(
      "Get category balances error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to calculate category balances",
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET TOTAL ALLOCATION PERCENTAGE
| GET /api/categories/total-percentage
|--------------------------------------------------------------------------
*/

const getTotalPercentage = async (
  req,
  res
) => {
  try {
    const total =
      await validateActivePercentageTotal();

    return res.status(200).json({
      success: true,

      totalPercentage: Number(
        total.toFixed(6)
      ),

      isValid:
        Math.abs(total - 100) <
        0.000001,
    });
  } catch (error) {
    console.error(
      "Percentage total error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to calculate allocation percentage",
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| CREATE CATEGORY
| POST /api/categories
|--------------------------------------------------------------------------
*/

const createCategory = async (
  req,
  res
) => {
  try {
    const {
      name,
      allocationPercentage = 0,
      openingBalance = 0,
      sortOrder = 999,
      isActive = true,
    } = req.body;

    /*
    |--------------------------------------------------------------------------
    | Name validation
    |--------------------------------------------------------------------------
    */

    if (
      !name ||
      !String(name).trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Category name is required",
      });
    }

    const cleanName =
      String(name).trim();

    /*
    |--------------------------------------------------------------------------
    | Percentage validation
    |--------------------------------------------------------------------------
    */

    const percentage =
      Number(allocationPercentage);

    if (
      !isValidPercentage(
        percentage
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Allocation percentage must be between 0 and 100",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Opening balance
    |--------------------------------------------------------------------------
    */

    const balance =
      Number(openingBalance);

    if (
      !Number.isFinite(balance) ||
      balance < 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Opening balance must be a valid non-negative number",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Sort order
    |--------------------------------------------------------------------------
    */

    const order =
      Number(sortOrder);

    if (
      !Number.isFinite(order)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Sort order must be a valid number",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Duplicate name
    |--------------------------------------------------------------------------
    */

    const existingCategory =
      await Category.findOne({
        name: {
          $regex: `^${cleanName.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )}$`,
          $options: "i",
        },
      });

    if (existingCategory) {
      return res.status(409).json({
        success: false,
        message:
          "Category already exists",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Active / Inactive
    |--------------------------------------------------------------------------
    */

    const active =
      isActive === true ||
      isActive === "true";

    /*
    |--------------------------------------------------------------------------
    | If active, don't allow total > 100
    |--------------------------------------------------------------------------
    */

    if (active) {
      const currentTotal =
        await getActivePercentageTotal();

      const newTotal =
        currentTotal +
        percentage;

      if (
        newTotal >
        100.000001
      ) {
        return res.status(400).json({
          success: false,
          message:
            `Total allocation percentage cannot exceed 100%. Current total: ${currentTotal.toFixed(
              6
            )}%`,
        });
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Create
    |--------------------------------------------------------------------------
    */

    const category =
      await Category.create({
        name: cleanName,

        allocationPercentage:
          percentage,

        openingBalance:
          balance,

        sortOrder: order,

        isActive: active,

        createdBy:
          req.user?._id || null,

        updatedBy:
          req.user?._id || null,
      });

    return res.status(201).json({
      success: true,
      message:
        "Category created successfully",
      data: category,
    });
  } catch (error) {
    console.error(
      "Create category error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to create category",
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| UPDATE CATEGORY
| PUT /api/categories/:id
|--------------------------------------------------------------------------
|
| Can update:
| - name
| - allocationPercentage
| - openingBalance
| - sortOrder
| - isActive
|
| IMPORTANT:
| Existing Allocation documents are NEVER modified.
|
*/

const updateCategory = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(id)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid category ID",
      });
    }

    const category =
      await Category.findById(id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message:
          "Category not found",
      });
    }

    const {
      name,
      allocationPercentage,
      openingBalance,
      sortOrder,
      isActive,
    } = req.body;

    /*
    |--------------------------------------------------------------------------
    | Name
    |--------------------------------------------------------------------------
    */

    if (name !== undefined) {
      const cleanName =
        String(name).trim();

      if (!cleanName) {
        return res.status(400).json({
          success: false,
          message:
            "Category name cannot be empty",
        });
      }

      const duplicate =
        await Category.findOne({
          _id: {
            $ne: id,
          },

          name: {
            $regex: `^${cleanName.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            )}$`,
            $options: "i",
          },
        });

      if (duplicate) {
        return res.status(409).json({
          success: false,
          message:
            "Another category with this name already exists",
        });
      }

      category.name =
        cleanName;
    }

    /*
    |--------------------------------------------------------------------------
    | Allocation Percentage
    |--------------------------------------------------------------------------
    */

    if (
      allocationPercentage !==
      undefined
    ) {
      const percentage =
        Number(
          allocationPercentage
        );

      if (
        !isValidPercentage(
          percentage
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Allocation percentage must be between 0 and 100",
        });
      }

      category.allocationPercentage =
        percentage;
    }

    /*
    |--------------------------------------------------------------------------
    | Opening Balance
    |--------------------------------------------------------------------------
    */

    if (
      openingBalance !==
      undefined
    ) {
      const balance =
        Number(openingBalance);

      if (
        !Number.isFinite(
          balance
        ) ||
        balance < 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Opening balance must be a valid non-negative number",
        });
      }

      category.openingBalance =
        balance;
    }

    /*
    |--------------------------------------------------------------------------
    | Sort Order
    |--------------------------------------------------------------------------
    */

    if (
      sortOrder !== undefined
    ) {
      const order =
        Number(sortOrder);

      if (
        !Number.isFinite(order)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Sort order must be a valid number",
        });
      }

      category.sortOrder =
        order;
    }

    /*
    |--------------------------------------------------------------------------
    | Status
    |--------------------------------------------------------------------------
    */

    if (
      isActive !== undefined
    ) {
      category.isActive =
        isActive === true ||
        isActive === "true";
    }

    /*
    |--------------------------------------------------------------------------
    | Validate active total
    |--------------------------------------------------------------------------
    |
    | We only prevent >100 here.
    |
    | Exact 100% validation is enforced when a
    | Received donation is allocated.
    |
    | This allows Admin to edit several categories
    | before reaching exactly 100%.
    |
    */

    if (
      category.isActive
    ) {
      const otherTotal =
        await getActivePercentageTotal(
          id
        );

      const finalTotal =
        otherTotal +
        toNumber(
          category.allocationPercentage
        );

      if (
        finalTotal >
        100.000001
      ) {
        return res.status(400).json({
          success: false,
          message:
            `Active allocation percentage cannot exceed 100%. Current total would be ${finalTotal.toFixed(
              6
            )}%`,
        });
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Save category only
    |--------------------------------------------------------------------------
    */

    category.updatedBy =
      req.user?._id || null;

    await category.save();

    /*
    |--------------------------------------------------------------------------
    | IMPORTANT HISTORICAL RULE
    |--------------------------------------------------------------------------
    |
    | DO NOT modify Allocation records.
    |
    | Old allocations keep the percentage and amount
    | that were calculated when the donation was received.
    |
    */

    return res.status(200).json({
      success: true,
      message:
        "Category updated successfully",
      data: category,
    });
  } catch (error) {
    console.error(
      "Update category error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to update category",
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| ACTIVATE / DEACTIVATE CATEGORY
| PATCH /api/categories/:id/status
|--------------------------------------------------------------------------
*/

const updateCategoryStatus = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category ID",
      });
    }

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isActive must be true or false",
      });
    }

    await session.withTransaction(async () => {
      const category = await Category.findById(id).session(
        session
      );

      if (!category) {
        throw new Error("Category not found");
      }

      /*
       * Change status first.
       */
      category.isActive = isActive;
      category.updatedBy = req.user?._id || null;

      await category.save({ session });

      /*
       * Get all active categories after the status change.
       */
      const activeCategories = await Category.find({
        isActive: true,
      })
        .sort({
          sortOrder: 1,
          createdAt: 1,
        })
        .session(session);

      /*
       * At least one active category must remain.
       */
      if (activeCategories.length === 0) {
        throw new Error(
          "At least one active category is required."
        );
      }

      /*
       * Automatically divide 100% equally.
       *
       * Example:
       * 7 categories = 14.285714%
       * 8 categories = 12.5%
       */
      const count = activeCategories.length;

      const basePercentage =
        Math.floor(
          (100 / count) * 1000000
        ) / 1000000;

      let assignedTotal = 0;

      for (let i = 0; i < count; i++) {
        let percentage;

        /*
         * Last category receives the rounding remainder
         * so total is EXACTLY 100%.
         */
        if (i === count - 1) {
          percentage = Number(
            (100 - assignedTotal).toFixed(6)
          );
        } else {
          percentage = basePercentage;
        }

        activeCategories[i].allocationPercentage =
          percentage;

        activeCategories[i].updatedBy =
          req.user?._id || null;

        await activeCategories[i].save({
          session,
        });

        assignedTotal += percentage;
      }
    });

    /*
     * Get fresh categories after transaction.
     */
    const updatedCategories = await Category.find({})
      .sort({
        sortOrder: 1,
        createdAt: 1,
      })
      .lean();

    const activeTotal = updatedCategories
      .filter(
        (category) =>
          category.isActive !== false
      )
      .reduce(
        (total, category) =>
          total +
          Number(
            category.allocationPercentage?.toString() ||
              0
          ),
        0
      );

    return res.status(200).json({
      success: true,

      message: isActive
        ? "Category activated and allocation percentages redistributed successfully."
        : "Category deactivated and allocation percentages redistributed successfully.",

      activeAllocationTotal:
        Number(activeTotal.toFixed(6)),

      data: updatedCategories,
    });
  } catch (error) {
    console.error(
      "Category status error:",
      error
    );

    return res.status(400).json({
      success: false,
      message:
        error.message ||
        "Failed to update category status",
    });
  } finally {
    await session.endSession();
  }
};

/*
|--------------------------------------------------------------------------
| EQUAL ALLOCATION
| POST /api/categories/equal-allocation
|--------------------------------------------------------------------------
|
| Only active categories receive equal percentages.
|
| Example:
| 7 active categories
| 100 / 7
|
| Last category receives rounding remainder.
|
*/

const equalAllocation = async (
  req,
  res
) => {
  try {
    const categories =
      await Category.find({
        isActive: true,
      }).sort({
        sortOrder: 1,
        createdAt: 1,
      });

    if (
      categories.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "No active categories found",
      });
    }

    const count =
      categories.length;

    /*
    |--------------------------------------------------------------------------
    | Six decimal places
    |--------------------------------------------------------------------------
    */

    const basePercentage =
      Math.floor(
        (100 / count) *
          1000000
      ) / 1000000;

    let assignedTotal = 0;

    for (
      let i = 0;
      i < count;
      i++
    ) {
      let percentage;

      /*
      |--------------------------------------------------------------------------
      | Last category gets exact remainder
      |--------------------------------------------------------------------------
      */

      if (
        i ===
        count - 1
      ) {
        percentage =
          Number(
            (
              100 -
              assignedTotal
            ).toFixed(6)
          );
      } else {
        percentage =
          basePercentage;
      }

      categories[
        i
      ].allocationPercentage =
        percentage;

      categories[
        i
      ].updatedBy =
        req.user?._id || null;

      await categories[
        i
      ].save();

      assignedTotal +=
        percentage;
    }

    /*
    |--------------------------------------------------------------------------
    | Return updated categories
    |--------------------------------------------------------------------------
    */

    const updatedCategories =
      await Category.find()
        .sort({
          sortOrder: 1,
          createdAt: 1,
        })
        .lean();

    return res.status(200).json({
      success: true,

      message:
        "Equal allocation applied successfully",

      activeAllocationTotal:
        Number(
          assignedTotal.toFixed(6)
        ),

      data: updatedCategories,
    });
  } catch (error) {
    console.error(
      "Equal allocation error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to apply equal allocation",
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| DELETE / DEACTIVATE CATEGORY
| DELETE /api/categories/:id
|--------------------------------------------------------------------------
|
| Financial history must never be deleted.
|
| If category has allocations or distributions:
| → deactivate
|
| If it has no financial history:
| → physically delete
|
*/

const deleteCategory = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    if (
      !mongoose.Types.ObjectId.isValid(
        id
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid category ID",
      });
    }

    const category =
      await Category.findById(id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message:
          "Category not found",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Check financial history
    |--------------------------------------------------------------------------
    */

    const hasAllocations =
      await Allocation.exists({
        categoryId: id,
      });

    const hasDistributions =
      await Distribution.exists({
        categoryId: id,
      });

    /*
    |--------------------------------------------------------------------------
    | Never hard delete financial category
    |--------------------------------------------------------------------------
    */

    if (
      hasAllocations ||
      hasDistributions
    ) {
      category.isActive =
        false;

      /*
       * IMPORTANT:
       *
       * Do NOT set allocationPercentage = 0.
       *
       * Keeping the old percentage makes it possible
       * to reactivate the category later.
       *
       * Historical Allocation records are untouched.
       */

      category.updatedBy =
        req.user?._id || null;

      await category.save();

      return res.status(200).json({
        success: true,

        message:
          "Category has financial history, so it was deactivated instead of deleted.",

        data: category,

        deactivated: true,
      });
    }

    /*
    |--------------------------------------------------------------------------
    | No financial history
    |--------------------------------------------------------------------------
    */

    await Category.findByIdAndDelete(
      id
    );

    return res.status(200).json({
      success: true,

      message:
        "Category deleted successfully",

      data: {
        id,
      },
    });
  } catch (error) {
    console.error(
      "Delete category error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to delete category",
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {
  getCategories,
  getCategoryById,
  getCategoryBalances,
  getTotalPercentage,
  createCategory,
  updateCategory,
  updateCategoryStatus,
  equalAllocation,
  deleteCategory,
};